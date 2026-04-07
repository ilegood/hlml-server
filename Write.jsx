import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { CATEGORY_MAP } from "./contants";

const Write = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    content: "",
    categories: {},
    image: null,
  });

  const handleImg = (e) => {
    const f = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => setForm({ ...form, image: r.result });
      r.readAsDataURL(f);
    }
  };

  const handleSubmit = () => {
    if (!form.title || !form.content) return alert("내용을 입력하세요.");
    const posts = JSON.parse(localStorage.getItem("posts") || "[]");
    localStorage.setItem(
      "posts",
      JSON.stringify([
        { ...form, id: Date.now(), createdAt: Date.now(), comments: [] },
        ...posts,
      ]),
    );
    navigate("/");
  };

  return (
    <>
      <Header title="글 작성" showBack />
      <main className="container write-container">
        <div className="write-form">
          <input
            className="form-input"
            placeholder="제목"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            className="form-textarea"
            placeholder="내용"
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          {Object.entries(CATEGORY_MAP).map(([cat, options]) => (
            <div key={cat} className="form-group">
              <label className="form-label">{cat}</label>
              <div className="tag-filters">
                {options.map((opt) => (
                  <button
                    key={opt}
                    className={`tag-btn ${form.categories[cat] === opt ? "active" : ""}`}
                    onClick={() =>
                      setForm({
                        ...form,
                        categories: {
                          ...form.categories,
                          [cat]: form.categories[cat] === opt ? null : opt,
                        },
                      })
                    }
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!form.image ? (
            <div
              className="drop-zone"
              onClick={() => document.getElementById("imgIn").click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleImg}
            >
              이미지 추가
              <input
                id="imgIn"
                type="file"
                style={{ display: "none" }}
                onChange={handleImg}
              />
            </div>
          ) : (
            <div className="image-preview">
              <img src={form.image} alt="" />
              <button
                className="remove-img-btn"
                onClick={() => setForm({ ...form, image: null })}
              >
                ✕
              </button>
            </div>
          )}
          <button className="submit-btn" onClick={handleSubmit}>
            등록하기
          </button>
        </div>
      </main>
    </>
  );
};

export default Write;
