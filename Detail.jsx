import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Header from "./Header";
import { getTimeAgo } from "./contants";

const Detail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [cmt, setCmt] = useState("");
  const [isEditModal, setIsEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", content: "" });

  useEffect(() => {
    const p = JSON.parse(localStorage.getItem("posts") || "[]").find(
      (x) => x.id === parseInt(id),
    );
    if (p) setPost(p);
  }, [id]);

  const update = (updated) => {
    const all = JSON.parse(localStorage.getItem("posts") || "[]");
    localStorage.setItem(
      "posts",
      JSON.stringify(all.map((p) => (p.id === updated.id ? updated : p))),
    );
    setPost(updated);
  };

  if (!post) return <main className="container">로딩 중...</main>;

  return (
    <>
      <Header title="" showBack />
      <main className="container">
        {post.image && <img src={post.image} alt="" className="detail-img" />}
        <div className="detail-body">
          <div className="card-tags" style={{ marginBottom: "10px" }}>
            {Object.values(post.categories || {})
              .filter(Boolean)
              .map((v) => (
                <span key={v} className="tag">
                  {v}
                </span>
              ))}
          </div>
          <h2 className="detail-title">{post.title}</h2>
          <p className="detail-content">{post.content}</p>
          <div className="detail-time">
            {new Date(post.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="comment-section">
          <div className="comment-title-row">
            <span className="comment-title">댓글</span>
            <span className="comment-count-badge">
              {post.comments?.length || 0}
            </span>
          </div>
          <div className="comment-list">
            {post.comments?.map((c) => (
              <div key={c.id} className="comment-item">
                <div className="comment-text">{c.text}</div>
              </div>
            ))}
          </div>
          <div className="comment-input-row">
            <input
              className="comment-input"
              placeholder="댓글..."
              value={cmt}
              onChange={(e) => setCmt(e.target.value)}
            />
            <button
              className="comment-submit"
              onClick={() => {
                if (!cmt) return;
                update({
                  ...post,
                  comments: [
                    ...(post.comments || []),
                    { id: Date.now(), text: cmt },
                  ],
                });
                setCmt("");
              }}
            >
              등록
            </button>
          </div>
        </div>
      </main>
    </>
  );
};

export default Detail;
