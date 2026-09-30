export default function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer__inner">
        <span>© {new Date().getFullYear()} DocExchange</span>
        <span>Built for the NoPainNoCode hackathon</span>
      </div>
    </footer>
  )
}
