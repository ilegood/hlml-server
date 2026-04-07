import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { CATEGORY_MAP, getTimeAgo } from "./contants";

const Home = () => {
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCats, setSelectedCats] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    setPosts(JSON.parse(localStorage.getItem("posts") || "[]"));
  }, []);

  const filtered = posts.filter((p) => {
    const matchSearch = (p.title + p.content)
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchCats = Object.entries(selectedCats).every(
      ([k, v]) => !v || p.categories?.[k] === v,
    );
    return matchSearch && matchCats;
  });

  return (
    <>
      <Header
        title="할래말래"
        actions={
          <button className="write-btn" onClick={() => navigate("/write")}>
            글쓰기
          </button>
        }
      />
      <main className="container">
        <div className="search-bar">
          <input
            placeholder="제목이나 내용 검색..."
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="tag-filters">
          {Object.entries(CATEGORY_MAP).map(([cat, options]) => (
            <select
              key={cat}
              className="tag-btn"
              onChange={(e) =>
                setSelectedCats({ ...selectedCats, [cat]: e.target.value })
              }
              style={{
                appearance: "none",
                border: "1.5px solid var(--border)",
                marginRight: "5px",
              }}
            >
              <option value="">{cat}</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className="card-list">
          {filtered.length > 0 ? (
            filtered.map((p) => (
              <div
                key={p.id}
                className="card"
                onClick={() => navigate(`/detail/${p.id}`)}
              >
                <div className="card-inner">
                  {p.image && (
                    <div className="card-img-wrap">
                      <img src={p.image} className="card-img" alt="" />
                    </div>
                  )}
                  <div className="card-body">
                    <div className="card-header-row">
                      {p.edited && <span className="edited-badge">수정됨</span>}
                      <span className="card-time">
                        {getTimeAgo(p.createdAt)}
                      </span>
                    </div>
                    <h3 className="card-title">{p.title}</h3>
                    <p className="card-content">{p.content}</p>
                    <div className="card-tags">
                      {Object.values(p.categories || {})
                        .filter(Boolean)
                        .map((v) => (
                          <span key={v} className="tag">
                            {v}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
                <div className="card-footer">
                  <span className="comment-count">
                    댓글{" "}
                    {p.comments?.reduce(
                      (acc, c) => acc + 1 + (c.replies?.length || 0),
                      0,
                    ) || 0}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">게시글이 없습니다.</div>
          )}
        </div>
      </main>
    </>
  );
};

export default Home;
