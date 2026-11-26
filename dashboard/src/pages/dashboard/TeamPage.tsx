import React, { useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { AdminRole, AdminUser } from '@/types/admin.types';
import {
  useGetTeamQuery,
  useInviteTeamMemberMutation,
  useRemoveTeamMemberMutation,
  useResendTeamInviteMutation,
  useSetTeamMemberStatusMutation,
  useUpdateTeamMemberMutation,
} from '@/lib/api/teamApi';
import { getErrorMessage } from '@/lib/api/baseApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { UserPlus, Trash2, Search, ChevronDown, Edit2, ShieldAlert, Loader2, Mail } from 'lucide-react';
import { formatDate } from '@/lib/utils';

/** Red error line shown inside modals / above the table. */
const ErrorLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">{text}</div>
);

/**
 * Admin team — `/admin/team` (super admin only on the server).
 * Other roles see a short notice instead of a 403 error.
 */
export const TeamPage: React.FC = () => {
  const currentUser = useAppSelector((state) => state.auth.currentUser);
  const isSuperAdmin = currentUser?.role === 'super_admin';

  const { data: members = [], isLoading, error: loadError } = useGetTeamQuery(undefined, { skip: !isSuperAdmin });
  const [inviteMember, { isLoading: isInviting }] = useInviteTeamMemberMutation();
  const [updateMember, { isLoading: isUpdating }] = useUpdateTeamMemberMutation();
  const [setMemberStatus] = useSetTeamMemberStatusMutation();
  const [removeMember] = useRemoveTeamMemberMutation();
  const [resendInvite] = useResendTeamInviteMutation();

  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const [memberToToggle, setMemberToToggle] = useState<{
    id: string;
    name: string;
    currentStatus: AdminUser['status'];
  } | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [inviteError, setInviteError] = useState('');

  // Edit Admin & Replace Email State (Super Admin Only)
  const [memberToEdit, setMemberToEdit] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<AdminRole>('admin');
  const [editError, setEditError] = useState('');

  const filteredMembers = members.filter((m) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return m.name.toLowerCase().includes(query) || m.email.toLowerCase().includes(query);
  });

  /** Runs a row action and shows the server message on failure. */
  const runAction = async (action: () => Promise<unknown>, successText?: string) => {
    setActionError('');
    setActionNotice('');
    try {
      await action();
      if (successText) setActionNotice(successText);
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviteError('');
    try {
      // The server emails an invite link; the new admin sets their password on /accept-invite.
      await inviteMember({ name: name.trim(), email: email.trim(), role }).unwrap();
      setName('');
      setEmail('');
      setIsInviteModalOpen(false);
      setActionNotice(`Invitation sent to ${email.trim()}.`);
    } catch (err) {
      setInviteError(getErrorMessage(err));
    }
  };

  const handleOpenEdit = (member: AdminUser) => {
    setMemberToEdit(member);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditRole(member.role);
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberToEdit || !editName.trim() || !editEmail.trim()) return;
    // Send only what changed (the server rejects an empty update).
    const changes: { name?: string; email?: string; role?: AdminRole } = {};
    if (editName.trim() !== memberToEdit.name) changes.name = editName.trim();
    if (editEmail.trim() !== memberToEdit.email) changes.email = editEmail.trim();
    if (editRole !== memberToEdit.role) changes.role = editRole;
    if (!Object.keys(changes).length) {
      setMemberToEdit(null);
      return;
    }
    try {
      await updateMember({ id: memberToEdit.id, ...changes }).unwrap();
      setMemberToEdit(null);
    } catch (err) {
      setEditError(getErrorMessage(err));
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team" subtitle="Manage administrator seats and access permissions." />
        <EmptyState
          icon={<ShieldAlert className="w-6 h-6" />}
          title="Super admin only"
          description="Only a super admin can view and manage the admin team."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        subtitle="Manage administrator seats and access permissions."
        actions={
          <Button
            variant="accent"
            size="sm"
            className="font-bold text-xs"
            onClick={() => setIsInviteModalOpen(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Add Admin
          </Button>
        }
      />

      {/* Search Bar */}
      <Card className="p-4">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 text-sm bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-pink/20 text-neutral-900 font-medium"
          />
        </div>
      </Card>

      {actionError && <ErrorLine text={actionError} />}
      {actionNotice && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800">
          {actionNotice}
        </div>
      )}

      {/* Team Table */}
      <Card>
        {isLoading ? (
          <div className="p-12 flex items-center justify-center text-neutral-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : loadError ? (
          <div className="p-4">
            <ErrorLine text={getErrorMessage(loadError)} />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-10 text-center text-xs text-neutral-500 font-medium">
            {searchQuery ? `No admins match "${searchQuery}".` : 'No team members yet.'}
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow
                key={member.id}
                className={member.status === 'suspended' ? 'opacity-60 bg-neutral-50/50' : ''}
              >
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar src={member.avatar} name={member.name} size="md" />
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-neutral-950 text-sm">{member.name}</span>
                      {member.id === currentUser?.id && (
                        <span className="text-xs bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded-md font-bold">
                          You
                        </span>
                      )}
                      {member.status === 'suspended' && (
                        <span className="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-md font-bold">
                          Suspended
                        </span>
                      )}
                      {member.status === 'invited' && (
                        <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-bold">
                          Invite pending
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell className="py-4">
                  <span className="text-sm text-neutral-800 font-semibold">{member.email}</span>
                </TableCell>

                <TableCell className="py-4">
                  <Badge
                    variant={
                      member.role === 'super_admin'
                        ? 'default'
                        : member.role === 'moderator'
                        ? 'neutral'
                        : 'pink'
                    }
                    size="md"
                    className="text-xs font-bold"
                  >
                    {member.role === 'super_admin'
                      ? 'Super Admin'
                      : member.role === 'moderator'
                      ? 'Moderator'
                      : 'Admin'}
                  </Badge>
                </TableCell>

                <TableCell className="py-4">
                  <span className="text-sm text-neutral-600 font-medium">
                    {member.createdAt ? formatDate(member.createdAt) : '—'}
                  </span>
                </TableCell>

                <TableCell className="text-right py-4">
                  {member.id !== currentUser?.id && (
                    <div className="flex items-center justify-end gap-2">
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-sm font-bold text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 p-2 gap-1.5"
                          onClick={() => handleOpenEdit(member)}
                          title="Edit administrator"
                        >
                          <Edit2 className="w-4 h-4 text-neutral-500" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                      )}
                      {member.status === 'invited' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-sm font-bold px-3 py-1.5 text-neutral-700 hover:bg-neutral-100 gap-1.5"
                          onClick={() =>
                            runAction(() => resendInvite(member.id).unwrap(), `Invitation re-sent to ${member.email}.`)
                          }
                          title="Send the invitation email again"
                        >
                          <Mail className="w-4 h-4 text-neutral-500" />
                          <span className="hidden sm:inline">Resend</span>
                        </Button>
                      ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`text-sm font-bold px-3 py-1.5 ${
                          member.status === 'active'
                            ? 'text-amber-700 hover:text-amber-800 hover:bg-amber-50'
                            : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50'
                        }`}
                        onClick={() =>
                          setMemberToToggle({
                            id: member.id,
                            name: member.name,
                            currentStatus: member.status,
                          })
                        }
                      >
                        {member.status === 'active' ? 'Suspend' : 'Activate'}
                      </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:bg-rose-50 p-2"
                        onClick={() => setMemberToDelete({ id: member.id, name: member.name })}
                        title="Remove admin seat"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </Card>

      {/* Add Administrator Modal */}
      {isInviteModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsInviteModalOpen(false)}
          title="Add Admin"
          description="Invite a new administrator to the dashboard."
          maxWidth="md"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsInviteModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="accent" size="sm" onClick={handleCreateAdmin} isLoading={isInviting}>
                Send Invite
              </Button>
            </>
          }
        >
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            {inviteError && <ErrorLine text={inviteError} />}
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Elena Rostova"
              required
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. elena@influverse.com"
              required
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Role
              </label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AdminRole)}
                  className="w-full h-10 pl-3 pr-8 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-brand-pink appearance-none cursor-pointer text-neutral-800 font-semibold"
                >
                  <option value="admin">Admin</option>
                  <option value="moderator">Moderator</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Admin & Replace Email Modal (Super Admin Authority) */}
      {memberToEdit && (
        <Modal
          isOpen={true}
          onClose={() => setMemberToEdit(null)}
          title="Edit Administrator"
          description="Update administrative credentials, assigned role, and login email."
          maxWidth="md"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMemberToEdit(null)}
              >
                Cancel
              </Button>
              <Button variant="accent" size="sm" onClick={handleSaveEdit} isLoading={isUpdating}>
                Save Changes
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            {editError && <ErrorLine text={editError} />}
            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed font-medium">
                <strong className="font-bold">Super Admin Authority:</strong> Only a Super Admin can modify administrative team details and login emails.
              </div>
            </div>

            <Input
              label="Full Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              helperText="The administrator will use this email address to sign in to the dashboard."
              required
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                Administrative Role
              </label>
              <div className="relative">
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as AdminRole)}
                  className="w-full h-10 pl-3 pr-8 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-brand-pink appearance-none cursor-pointer text-neutral-800 font-semibold"
                >
                  <option value="admin">Admin</option>
                  <option value="moderator">Moderator</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirm Suspend / Activate Dialog */}
      <ConfirmDialog
        isOpen={Boolean(memberToToggle)}
        onClose={() => setMemberToToggle(null)}
        onConfirm={() => {
          if (memberToToggle) {
            const target = memberToToggle;
            setMemberToToggle(null);
            void runAction(() =>
              setMemberStatus({
                id: target.id,
                action: target.currentStatus === 'active' ? 'suspend' : 'activate',
              }).unwrap(),
            );
          }
        }}
        title={
          memberToToggle?.currentStatus === 'active'
            ? 'Suspend Administrator Access'
            : 'Reactivate Administrator Access'
        }
        description={
          memberToToggle?.currentStatus === 'active'
            ? `Are you sure you want to suspend access for ${memberToToggle.name}? They will immediately lose access to the admin dashboard.`
            : `Reactivate dashboard privileges for ${memberToToggle?.name}? They will regain full administrative access.`
        }
        variant={memberToToggle?.currentStatus === 'active' ? 'warning' : 'info'}
        confirmLabel={
          memberToToggle?.currentStatus === 'active'
            ? 'Suspend Access'
            : 'Reactivate Access'
        }
      />

      {/* Confirm Delete Admin Dialog */}
      <ConfirmDialog
        isOpen={Boolean(memberToDelete)}
        onClose={() => setMemberToDelete(null)}
        onConfirm={() => {
          if (memberToDelete) {
            const target = memberToDelete;
            setMemberToDelete(null);
            void runAction(() => removeMember(target.id).unwrap(), `${target.name} was removed.`);
          }
        }}
        title="Revoke Administrator Seat"
        description={`Are you sure you want to permanently remove ${memberToDelete?.name} from the administrator roster? This seat and all associated access will be revoked.`}
        variant="danger"
        confirmLabel="Revoke & Delete"
      />
    </div>
  );
};
