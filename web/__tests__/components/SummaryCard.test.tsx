import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import SummaryCard from '@/components/SummaryCard'

describe('SummaryCard', () => {
    it('renders label and value correctly', () => {
        const label = 'Total Salary'
        const value = 500

        render(<SummaryCard label={label} value={value} />)

        const labelElement = screen.getByText(label)
        const valueElement = screen.getByText('$500') // Check for formatted value

        expect(labelElement).toBeInTheDocument()
        expect(valueElement).toBeInTheDocument()
    })

    it('renders string values without formatting', () => {
        const label = 'Status'
        const value = 'Active'

        render(<SummaryCard label={label} value={value} />)

        const valueElement = screen.getByText('Active')
        expect(valueElement).toBeInTheDocument()
    })
})
