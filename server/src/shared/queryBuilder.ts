import { FilterQuery, Query } from "mongoose";
import { IMeta } from "./sendResponse";
import { escapeRegex } from "../utils/regex";


const MAX_LIMIT = 100;

type Options = {
  /** Fields searched case-insensitively by `?q=` */
  searchableFields?: string[];
  /** Only these keys are passed to `find()` as filters — everything else is ignored (audit #15) */
  filterableFields?: string[];
  /** Allowed sort field (without the `-` prefix). Default: createdAt */
  sortableFields?: string[];
  defaultSort?: string;
  defaultLimit?: number;
};

/**
 * Generic list builder for admin / list endpoints.
 * Query param: `?q=&page=&limit=&sort=-createdAt&<filterable>=value`
 * Input should already be Zod-parsed by `validateRequest`; this is a second line of defence.
 */
class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  private readonly query: Record<string, unknown>;
  private readonly opts: Required<Options>;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>, opts: Options = {}) {
    this.modelQuery = modelQuery;
    this.query = query;
    this.opts = {
      searchableFields: opts.searchableFields ?? [],
      filterableFields: opts.filterableFields ?? [],
      sortableFields: opts.sortableFields ?? ["createdAt"],
      defaultSort: opts.defaultSort ?? "-createdAt",
      defaultLimit: opts.defaultLimit ?? 20,
    };
  }

  private get page() {
    const page = Number(this.query.page);
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  private get limit() {
    const limit = Number(this.query.limit);
    return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : this.opts.defaultLimit;
  }

  search() {
    const q = this.query.q ?? this.query.searchTerm;
    if (typeof q === "string" && q.trim() && this.opts.searchableFields.length) {
      const regex = new RegExp(escapeRegex(q.trim().slice(0, 100)), "i");
      this.modelQuery = this.modelQuery.find({
        $or: this.opts.searchableFields.map((field) => ({ [field]: regex })),
      } as FilterQuery<T>);
    }
    return this;
  }

  filter() {
    const filter: Record<string, unknown> = {};
    for (const field of this.opts.filterableFields) {
      const value = this.query[field];
      // Primitives only (string / number / boolean) — never objects / operators
      if (["string", "number", "boolean"].includes(typeof value)) filter[field] = value;
    }
    if (Object.keys(filter).length) this.modelQuery = this.modelQuery.find(filter as FilterQuery<T>);
    return this;
  }

  sort() {
    const requested = typeof this.query.sort === "string" ? this.query.sort : "";
    const field = requested.replace(/^-/, "");
    const sort = field && this.opts.sortableFields.includes(field) ? requested : this.opts.defaultSort;
    // _id tie-breaker for stable pagination
    this.modelQuery = this.modelQuery.sort(`${sort} _id`);
    return this;
  }

  paginate() {
    this.modelQuery = this.modelQuery.skip((this.page - 1) * this.limit).limit(this.limit);
    return this;
  }

  populate(populateFields: string[], selectFields: Record<string, string> = {}) {
    this.modelQuery = this.modelQuery.populate(
      populateFields.map((path) => ({ path, select: selectFields[path] })),
    );
    return this;
  }

  /** Must be called AFTER search() + filter() — counts with the same filter */
  async getMeta(): Promise<IMeta> {
    const total = await this.modelQuery.model.countDocuments(this.modelQuery.getFilter());
    return {
      page: this.page,
      limit: this.limit,
      total,
      totalPages: Math.ceil(total / this.limit),
    };
  }
}

export default QueryBuilder;
