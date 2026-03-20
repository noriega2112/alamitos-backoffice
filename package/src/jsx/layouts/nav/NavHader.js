import { Link } from 'react-router-dom';
import logo from '../../../images/alamitos-logo.jpg';

const NavHader = () => {
  return (
    <div className="nav-header">
      <Link to="/" className="brand-logo">
        <img src={logo} alt="Alamitos" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
      </Link>
    </div>
  );
};

export default NavHader;
