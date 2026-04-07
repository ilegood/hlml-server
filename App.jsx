import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./Home";
import Write from "./Write";
import Detail from "./Detail";
import "./index.css";

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/write" element={<Write />} />
      <Route path="/detail/:id" element={<Detail />} />
    </Routes>
  </Router>
);

export default App;
