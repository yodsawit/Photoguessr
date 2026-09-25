import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

type Props = {
  src: string
  className?: string
  loop?: boolean
  /** Start playing on mount (muted, inline). Otherwise call play() on the handle. */
  autoPlay?: boolean
  onEnded?: () => void
  onError?: () => void
  /**
   * `key` (default): solid subjects (cats). `fire`: see-through light over green (explosions); the
   * green background is un-mixed out so the flames stay orange instead of turning olive.
   */
  mode?: 'key' | 'fire'
  /** Pause the clip (and its drawing) while true, e.g. while something covers it; resumes after. */
  frozen?: boolean
}

export type ChromaVideoHandle = { play: () => void }

/**
 * A green-screen video with the green removed, drawn by a tiny WebGL shader onto a canvas. Plain
 * `<video>` can't do transparency on iPhone (no WebM alpha), so this keys every frame instead.
 * The video itself is muted, inline and hidden; if WebGL is unavailable the video is shown as-is.
 */
export const ChromaVideo = forwardRef<ChromaVideoHandle, Props>(function ChromaVideo({ src, className, loop = true, autoPlay = true, onEnded, onError, mode = 'key', frozen = false }, ref) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)

  useImperativeHandle(ref, () => ({
    play: () => {
      const v = video.current
      if (!v) return
      v.currentTime = 0
      void v.play().catch(() => undefined)
    },
  }))

  useEffect(() => {
    const v = video.current
    const c = canvas.current
    if (!v || !c) return
    const gl = c.getContext('webgl', { premultipliedAlpha: true, alpha: true })
    if (!gl) {
      setFallback(true)
      return
    }
    const program = createProgram(gl)
    if (!program) {
      setFallback(true)
      return
    }
    gl.useProgram(program)
    gl.uniform1f(gl.getUniformLocation(program, 'fire'), mode === 'fire' ? 1 : 0)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    // Upload + draw only when the video has a NEW frame (requestVideoFrameCallback, Safari 15.4+ /
    // Chrome): a 30 fps clip on a 60-120 Hz screen would otherwise be re-uploaded 2-4x per frame,
    // which made the page lag in Safari. Falls back to requestAnimationFrame.
    const perFrame = typeof v.requestVideoFrameCallback === 'function'
    let pending = 0
    let visible = true
    const render = () => {
      if (v.readyState >= 2 && v.videoWidth) {
        if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
          c.width = v.videoWidth
          c.height = v.videoHeight
          gl.viewport(0, 0, c.width, c.height)
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
    }
    const onFrame = () => {
      pending = 0
      render()
      schedule()
    }
    const schedule = () => {
      if (pending || !visible || v.paused || v.ended) return
      pending = perFrame ? v.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onFrame)
    }
    const cancel = () => {
      if (!pending) return
      if (perFrame) v.cancelVideoFrameCallback(pending)
      else cancelAnimationFrame(pending)
      pending = 0
    }
    // A paused video still needs one draw after loading or seeking (the first/current frame).
    const kick = () => {
      requestAnimationFrame(render)
      schedule()
    }
    // Draw only while playing and on screen.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) kick()
      else cancel()
    })
    io.observe(c)
    v.addEventListener('play', kick)
    v.addEventListener('seeked', kick)
    v.addEventListener('loadeddata', kick)
    kick()
    return () => {
      cancel()
      io.disconnect()
      v.removeEventListener('play', kick)
      v.removeEventListener('seeked', kick)
      v.removeEventListener('loadeddata', kick)
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      // No loseContext(): StrictMode re-runs this effect on the same canvas and would get a dead context.
    }
  }, [mode])

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (frozen) v.pause()
    else if (autoPlay) void v.play().catch(() => undefined)
  }, [frozen, autoPlay])

  return (
    <>
      <video
        ref={video}
        src={src}
        muted
        playsInline
        loop={loop}
        autoPlay={autoPlay}
        preload="auto"
        crossOrigin="anonymous"
        onEnded={onEnded}
        onError={onError}
        className={fallback ? className : 'pointer-events-none absolute h-px w-px opacity-0'}
        aria-hidden
      />
      {!fallback && <canvas ref={canvas} className={className} aria-hidden />}
    </>
  )
})

const VERTEX = `attribute vec2 p; varying vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

/**
 * key:  "greenness" = g - max(r, b). Clearly green -> transparent, a soft band for fur edges, and the
 *       green tint (spill) is pulled out of what remains.
 * fire: un-mixes a see-through flame from the green background (0, 0.706, 0). Assuming the flame's
 *       own green is 0.75 x its red (orange/yellow light): a = 1 - (g - 0.75 r) / 0.706, at least b
 *       so the white-hot core stays solid. The premultiplied colour is then c - (1 - a) * bg.
 * Output is premultiplied alpha (the canvas is created with premultipliedAlpha: true).
 */
const FRAGMENT = `precision mediump float; varying vec2 uv; uniform sampler2D t; uniform float fire;
void main() {
  vec4 c = texture2D(t, uv);
  float m = max(c.r, c.b);
  if (fire > 0.5) {
    float a = clamp(max(1.0 - (c.g - 0.75 * c.r) / 0.706, c.b), 0.0, 1.0);
    a = a < 0.04 ? 0.0 : a;
    float g = max(c.g - (1.0 - a) * 0.706, 0.0);
    gl_FragColor = vec4(min(c.r, a), min(g, a), min(c.b, a), a);
    return;
  }
  float a = 1.0 - smoothstep(0.08, 0.28, c.g - m);
  vec3 rgb = vec3(c.r, min(c.g, m + 0.04), c.b);
  gl_FragColor = vec4(rgb * a, a);
}`

function createProgram(gl: WebGLRenderingContext) {
  const compile = (type: number, source: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, source)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vs || !fs) return null
  const p = gl.createProgram()!
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null
}
