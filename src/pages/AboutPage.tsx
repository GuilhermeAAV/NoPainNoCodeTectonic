export default function AboutPage() {
  return (
    <section className="prose">
      <h1>About</h1>
      <p>
        DocExchange brings an organisation’s internal documents together and gives each one a trust score from 0 to
        100. Validations from experts raise it. Conflicts with other sources and outdated content lower it.
      </p>
      <p>
        Every document also has a required clearance level. If your level is high enough, you can open it. If not, it
        stays hidden from you.
      </p>
      <p className="muted">Built for the NoPainNoCode hackathon.</p>
    </section>
  )
}
