export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <span>© {new Date().getFullYear()} DocExchange</span>
        <span className="mono">Projet hackathon NoPainNoCode</span>
      </div>
    </footer>
  )
}
