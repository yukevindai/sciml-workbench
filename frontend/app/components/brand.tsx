import Image from 'next/image';

/** The approved Colattice mark. Decorative beside a wordmark or named link. */
export function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return <Image src="/brand/colattice-icon.webp" width={size} height={size} alt="" aria-hidden="true" className={`colattice-mark ${className}`} unoptimized />;
}

export function BrandWordmark({ className = '' }: { className?: string }) {
  return <span className={`colattice-wordmark ${className}`}>colattice</span>;
}
