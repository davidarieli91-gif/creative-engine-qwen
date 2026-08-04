import React from 'react'
import ReactDOM from 'react-dom/client'
import { Editor } from './components/Editor'
import './styles/main.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
)
