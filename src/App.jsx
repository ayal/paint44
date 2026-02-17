import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import base44 from "./api/base44Client";

const COLORS = [
  "#ffffff", "#ff4466", "#ff8844", "#ffcc33",
  "#44dd66", "#33bbff", "#7c5cfc", "#ff66cc",
  "#1a1a24", "#666666", "#aa8866", "#446644",
];

const CANVAS_W = 800;
const CANVAS_H = 560;

export default function App() {
  const [paintings, setPaintings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [artistName, setArtistName] = useState("");
  const [title, setTitle] = useState("");
  const canvasRef = useRef(null);

  useEffect(() => {
    document.title = "paint44";
    loadPaintings();

    const unsub = base44.entities.Painting.subscribe((event) => {
      setPaintings((prev) => {
        if (event.type === "create") {
          return [event.data, ...prev];
        }
        if (event.type === "update") {
          return prev.map((p) => (p.id === event.id ? event.data : p));
        }
        if (event.type === "delete") {
          return prev.filter((p) => p.id !== event.id);
        }
        return prev;
      });
    });

    return () => unsub();
  }, []);

  async function loadPaintings() {
    try {
      const list = await base44.entities.Painting.list("-created_date", 200, 0);
      setPaintings(list);
    } catch (err) {
      console.error("Failed to load paintings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(canvasBlob) {
    if (!artistName.trim()) return alert("Tell us your name!");
    if (!title.trim()) return alert("Give your painting a name!");
    setSubmitting(true);
    try {
      const file = new File([canvasBlob], "painting.png", { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Painting.create({
        title: title.trim(),
        image_url: file_url,
        artist_name: artistName.trim(),
      });
      setTitle("");
      canvasRef.current?.clear();
    } catch (err) {
      console.error("Submit failed:", err);
      alert("Failed to submit painting. Try again!");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>paint<span>44</span></h1>
        <p>Draw something. Share it with the world.</p>
      </header>

      <main className="main">
        {/* Left: Canvas */}
        <div className="panel panel-canvas">
          <Canvas
            ref={canvasRef}
            onSubmit={handleSubmit}
            submitting={submitting}
            title={title}
            setTitle={setTitle}
            artistName={artistName}
            setArtistName={setArtistName}
          />
        </div>

        {/* Right: Gallery */}
        <div className="panel panel-gallery">
          <h2 className="section-title">
            Gallery {!loading && <span className="count">{paintings.length}</span>}
          </h2>

          {loading ? (
            <div className="centered-msg"><span className="spinner" /></div>
          ) : paintings.length === 0 ? (
            <div className="centered-msg"><p>No paintings yet. Be the first!</p></div>
          ) : (
            <div className="gallery-grid">
              {paintings.map((p) => (
                <div key={p.id} className="card" onClick={() => setLightbox(p)}>
                  <img src={p.image_url} alt={p.title} loading="lazy" />
                  <div className="card-info">
                    <h3>{p.title}</h3>
                    <span className="artist">by {p.artist_name || "Anonymous"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(null)}>&times;</button>
            <img src={lightbox.image_url} alt={lightbox.title} />
            <div className="lightbox-info">
              <h3>{lightbox.title}</h3>
              <span className="artist">by {lightbox.artist_name || "Anonymous"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------- Canvas Component -------- */

const Canvas = forwardRef(function Canvas({ onSubmit, submitting, title, setTitle, artistName, setArtistName }, ref) {
  const canvasElRef = useRef(null);
  const ctxRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(4);
  const lastPos = useRef(null);
  const history = useRef([]);

  useImperativeHandle(ref, () => ({ clear: clearCanvas }));

  useEffect(() => {
    const canvas = canvasElRef.current;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#111118";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  const getPos = useCallback((e) => {
    const rect = canvasElRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const saveSnapshot = useCallback(() => {
    const ctx = ctxRef.current;
    history.current.push(ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
    if (history.current.length > 50) history.current.shift();
  }, []);

  const startDraw = useCallback(
    (e) => {
      e.preventDefault();
      saveSnapshot();
      setDrawing(true);
      const pos = getPos(e);
      lastPos.current = pos;
      const ctx = ctxRef.current;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [color, brushSize, getPos, saveSnapshot]
  );

  const draw = useCallback(
    (e) => {
      if (!drawing) return;
      e.preventDefault();
      const pos = getPos(e);
      const ctx = ctxRef.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPos.current = pos;
    },
    [drawing, color, brushSize, getPos]
  );

  const endDraw = useCallback(() => {
    setDrawing(false);
    lastPos.current = null;
  }, []);

  function undo() {
    if (history.current.length === 0) return;
    const ctx = ctxRef.current;
    ctx.putImageData(history.current.pop(), 0, 0);
  }

  function clearCanvas() {
    saveSnapshot();
    const ctx = ctxRef.current;
    ctx.fillStyle = "#111118";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  function handleSubmit() {
    canvasElRef.current.toBlob((blob) => {
      if (blob) onSubmit(blob);
    }, "image/png");
  }

  return (
    <div className="canvas-area">
      <div className="toolbar">
        <div className="color-palette">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch${color === c ? " active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="toolbar-right">
          <label className="brush-ctrl">
            <span>{brushSize}px</span>
            <input
              type="range"
              min={1}
              max={40}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
          </label>
          <button className="btn btn-ghost btn-sm" onClick={undo}>Undo</button>
          <button className="btn btn-ghost btn-sm" onClick={clearCanvas}>Clear</button>
        </div>
      </div>

      <div className="canvas-frame">
        <canvas
          ref={canvasElRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>

      <div className="submit-area">
        <input
          type="text"
          className="input"
          placeholder="Name your masterpiece..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          maxLength={100}
        />
        <div className="submit-bottom">
          <input
            type="text"
            className="input"
            placeholder="Your name"
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            maxLength={60}
          />
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <><span className="spinner" /> Saving...</> : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
});
