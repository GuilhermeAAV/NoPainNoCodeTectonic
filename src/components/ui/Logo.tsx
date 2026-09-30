import { FileStack } from 'lucide-react'

/** Tuile de marque, même traitement que la tuile « Trust Radar » du tableau de bord */
export default function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-12 rounded-2xl' : 'size-10 rounded-xl'
  return (
    <span
      className={`grid ${box} shrink-0 place-items-center bg-[#2B0B45] text-white shadow-[0_8px_20px_-8px_rgba(43,11,69,0.8)]`}
      aria-hidden="true"
    >
      <FileStack className={size === 'lg' ? 'size-6 text-[#FF5CB8]' : 'size-5 text-[#FF5CB8]'} />
    </span>
  )
}
