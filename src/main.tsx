import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './design/styles.css'
import templates from './design/templates.html?raw'
import { boot } from './design/app.js'

// The UI is the CODE//ARENA design (src/design), rendered as-is so every screen matches it pixel for pixel.
let booted = false
function DesignApp() {
  useEffect(() => {
    if (booted) return
    booted = true
    document.body.insertAdjacentHTML('beforeend', templates)
    boot()
  }, [])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><DesignApp /></StrictMode>,
)
