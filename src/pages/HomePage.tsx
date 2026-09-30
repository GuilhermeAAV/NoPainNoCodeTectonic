import { useState } from 'react'
import Button from '@/components/ui/Button'

export default function HomePage() {
  const [count, setCount] = useState(0)

  return (
    <section>
      <h1>Bienvenue sur Tectonic</h1>
      <p>Point de départ de l'application React.</p>
      <Button onClick={() => setCount((c) => c + 1)}>Cliqué {count} fois</Button>
    </section>
  )
}
