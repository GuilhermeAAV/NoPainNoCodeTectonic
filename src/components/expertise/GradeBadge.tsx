import type { Grade } from '@/utils/expertise'

interface Props {
  grade: Grade
  /** Libellé accessible, ex. « Cybersecurity » */
  domain?: string
  size?: 'small' | 'large'
}

/** Note d'expertise de F à A, colorée du rouge (F) au vert (A) */
export default function GradeBadge({ grade, domain, size = 'small' }: Props) {
  return (
    <span
      className={`grade grade--${grade.toLowerCase()} ${size === 'large' ? 'grade--large' : ''}`}
      title={domain ? `Grade ${grade} in ${domain}` : `Grade ${grade}`}
    >
      {grade}
    </span>
  )
}
