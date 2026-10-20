import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/plus-jakarta-sans'
import { App } from './app/App'
import { AuthProvider } from './lib/cloud/AuthProvider'
import './styles/global.css'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><BrowserRouter><App /></BrowserRouter></AuthProvider></React.StrictMode>)
