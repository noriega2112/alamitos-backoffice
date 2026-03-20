import React, { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import PerfectScrollbar from 'react-perfect-scrollbar';
import { Link } from 'react-router-dom';
/// Scroll
//import PerfectScrollbar from "react-perfect-scrollbar";

/// Image
//import profile from "../../../images/profile/pic1.jpg";
//import avatar from "../../../images/avatar/1.jpg";
//import { Dropdown } from "react-bootstrap";
import LogoutPage from './Logout';

import HeaderSlider from './HeaderSlider';

//import avatar from "../../../images/avatar/1.jpg";
import profile from '../../../images/banner-img/pic-1.png';

const LocationIcon = <i className="fa-solid fa-location-dot mx-2 " />;

//return BoxTab.classList.toggle("active"),SearchBlog.classList.toggle("active");

function AddSearchSlider() {
  //alert(111);
  let SearchBlog = document.getElementById('Search-Blog');
  let BoxTab = document.getElementById('close-searchbox');
  setTimeout(() => {
    if (BoxTab.classList.contains('active')) {
      return (BoxTab.classList.remove('active'), SearchBlog.classList.remove('active'));
    } else {
      return (BoxTab.classList.add('active'), SearchBlog.classList.add('active'));
    }
  }, 100);
}

const Header = ({ onNote }) => {
  const [headerFix, setheaderFix] = useState(false);
  useEffect(() => {
    // for header fix on scroll
    window.addEventListener('scroll', () => {
      setheaderFix(window.scrollY > 50);
    });
  }, []);

  //const [searchBut, setSearchBut] = useState(false);
  //var path = window.location.pathname.split("/");
  //var name = path[path.length - 1].split("-");
  //var filterName = name.length >= 3 ? name.filter((n, i) => i > 0) : name;
  //var finalName = filterName.includes("app")
  //  ? filterName.filter((f) => f !== "app")
  //  : filterName.includes("ui")
  //  ? filterName.filter((f) => f !== "ui")
  //  : filterName.includes("uc")
  //  ? filterName.filter((f) => f !== "uc")
  //  : filterName.includes("basic")
  //  ? filterName.filter((f) => f !== "basic")
  //  : filterName.includes("table")
  //  ? filterName.filter((f) => f !== "table")
  //  : filterName.includes("page")
  //  ? filterName.filter((f) => f !== "page")
  //  : filterName.includes("email")
  //  ? filterName.filter((f) => f !== "email")
  //  : filterName.includes("ecom")
  //  ? filterName.filter((f) => f !== "ecom")
  //  : filterName.includes("chart")
  //  ? filterName.filter((f) => f !== "chart")
  //  : filterName.includes("editor")
  //  ? filterName.filter((f) => f !== "editor")
  //  : filterName;
  return (
    <div className={`header ${headerFix ? 'is-fixed' : ''}`}>
      <div className="header-content">
        <nav className="navbar navbar-expand">
          <div className="container d-block my-0">
            <div className="d-flex align-items-center justify-content-sm-between justify-content-end">
              <div className="header-left">
                <div className="nav-item d-flex align-items-center"></div>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
};

export default Header;
