const Footer = () => {
  return (
    <footer
      id="contact"
      className="border-t border-white/5 px-6 py-10 text-sm text-white/50"
    >
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-4">
        <p>© {new Date().getFullYear()} AutoHDR — Photo to Video for Real Estate.</p>
        <div className="flex items-center gap-6">
          <a className="hover:text-white transition" href="#">
            Privacy
          </a>
          <a className="hover:text-white transition" href="#">
            Terms
          </a>
          <a
            className="hover:text-white transition"
            href="mailto:hello@autohdr.com"
          >
            hello@autohdr.com
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
