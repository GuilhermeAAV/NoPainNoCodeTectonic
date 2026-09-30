export default function AboutPage() {
  return (
    <section className="prose">
      <h1>À propos</h1>
      <p>
        DocExchange centralise les documents internes d'une organisation et les partage selon le niveau
        d'accréditation de chaque personne, de 0 à 100.
      </p>
      <p>
        Chaque document porte un niveau requis. Si votre niveau est suffisant, vous l'ouvrez. Sinon, il reste sous
        pli : vous voyez qu'il existe et à quel service il appartient, jamais son contenu.
      </p>
      <p className="muted">Projet réalisé dans le cadre du hackathon NoPainNoCode.</p>
    </section>
  )
}
