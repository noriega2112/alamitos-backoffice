import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../../images/logo-green.png';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={`header header-logo-only ${scrolled ? 'is-fixed scrolled' : 'is-fixed'}`}>
      <Link to="/" className="header-logo-link">
        <img src={logo} alt="Alamitos" />
      </Link>
    </div>
  );
};

export default Header;
