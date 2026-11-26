import Link from 'next/link';

/** Same "Brand not found" screen the page showed before it moved to the server (now with a real 404). */
export default function BrandNotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4 font-sans">
      <div className="text-center space-y-3 max-w-sm">
        <h1 className="text-2xl font-black text-[#0A0A0A]">Brand not found</h1>
        <p className="text-sm text-[#66665E]">This brand profile doesn&apos;t exist or is no longer available.</p>
        <Link href="/" className="inline-block px-5 py-2.5 rounded-full bg-[#0A0A0A] text-white text-sm font-bold">
          Back to home
        </Link>
      </div>
    </div>
  );
}
