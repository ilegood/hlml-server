import React from "react";
import { useNavigate } from "react-router-dom";

const Header = ({ title, showBack = false, actions }) => {
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header-inner">
        {showBack ? (
          <button className="back-btn" onClick={() => navigate(-1)}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : null}
        <div className="logo">{title}</div>
        <div className="header-actions">
          {actions ? (
            actions
          ) : (
            <div style={{ width: showBack ? "18px" : "0" }}></div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
