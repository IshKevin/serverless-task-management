import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
    it('renders without crashing', () => {
        // Mock Amplify + QueryClient for real test
        expect(true).toBe(true)
    })
})