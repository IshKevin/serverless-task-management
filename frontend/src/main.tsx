import React from 'react'
import ReactDOM from 'react-dom/client'
import { Authenticator } from '@aws-amplify/ui-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './amplify.ts'
import './index.css'
import '@aws-amplify/ui-react/styles.css'

const qc = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={qc}>
            <Authenticator>
                <App />
            </Authenticator>
        </QueryClientProvider>
    </React.StrictMode>
)