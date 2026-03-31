import React from "react";
import { FaWhatsapp, FaMapMarkerAlt, FaClock } from "react-icons/fa";

const BRANCHES = [
  {
    label: "Boulevard",
    name: "Restaurante Los Alamitos",
    address: "Boulevard hacia el Barrial, frente a Condominios Terranova, San Pedro Sula",
    phone: "9452-8414",
    wa: "50494528414",
    schedule: [
      { days: "Lun – Jue", hours: "12:00 pm – 10:00 pm" },
      { days: "Vie – Sáb", hours: "12:00 pm – 11:00 pm" },
      { days: "Domingo",   hours: "12:00 pm – 9:00 pm"  },
    ],
  },
  {
    label: "Mega Mall",
    name: "Restaurante Los Alamitos",
    address: "Mega Mall, Segundo Nivel, La Zona, San Pedro Sula",
    phone: "9402-4533",
    wa: "50494024533",
    schedule: [
      { days: "Lun – Dom", hours: "11:00 am – 8:45 pm" },
    ],
  },
];

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__branches">
          {BRANCHES.map((branch) => (
            <div key={branch.label} className="site-footer__branch">
              <span className="site-footer__branch-label">{branch.label}</span>
              <h6 className="site-footer__branch-name">{branch.name}</h6>

              <div className="site-footer__row">
                <FaMapMarkerAlt className="site-footer__icon" />
                <span>{branch.address}</span>
              </div>

              <div className="site-footer__row">
                <FaWhatsapp className="site-footer__icon site-footer__icon--wa" />
                <a
                  href={`https://wa.me/${branch.wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="site-footer__wa-link"
                >
                  {branch.phone}
                </a>
              </div>

              <div className="site-footer__row site-footer__row--top">
                <FaClock className="site-footer__icon" />
                <div className="site-footer__schedule">
                  {branch.schedule.map((s) => (
                    <div key={s.days}>
                      <strong>{s.days}:</strong> {s.hours}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="site-footer__copy">
          Diseñado y desarrollado por Edwin Noriega {year}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
