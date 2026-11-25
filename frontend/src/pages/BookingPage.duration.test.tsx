import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BookingPage } from './BookingPage'

vi.mock('../api/generated/booking', () => ({
  listMeetingTypes: vi.fn(),
  listSlots: vi.fn(),
  createMeeting: vi.fn(),
}))

import { createMeeting, listMeetingTypes, listSlots } from '../api/generated/booking'
import type { Meeting, MeetingType, Slot, SlotsResponse } from '../api/generated/booking'

const fortyFiveMinutesType: MeetingType = {
  id: 'consultation',
  title: 'Консультация',
  description: '',
  durationMinutes: 45,
}

const bookedFortyFiveMeeting: Meeting = {
  id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff',
  meetingTypeId: 'consultation',
  meetingTypeTitle: 'Консультация',
  durationMinutes: 45,
  start: '2026-11-02T10:00:00+03:00',
  end: '2026-11-02T10:45:00+03:00',
  guestName: 'Анна',
}

const slot: Slot = {
  start: '2026-11-02T10:00:00+03:00',
  end: '2026-11-02T10:45:00+03:00',
  available: true,
}

function slotsResponse(slots: Slot[]): SlotsResponse {
  const days = Array.from({ length: 14 }, (_, offset) => ({
    date: new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10),
    slots: offset === 0 ? slots : [],
  }))
  return {
    timezone: 'Europe/Moscow',
    window: { from: '2026-11-02', to: '2026-11-15' },
    days,
  }
}

function renderBookingPage() {
  return render(
    <MantineProvider defaultColorScheme="light">
      <MemoryRouter>
        <BookingPage />
      </MemoryRouter>
    </MantineProvider>,
  )
}

async function book(user: UserEvent, name = 'Анна') {
  await user.click(await screen.findByRole('button', { name: /Консультация/ }))
  await user.click(await screen.findByRole('button', { name: '10:00–10:45' }))
  await user.type(screen.getByLabelText('Ваше имя'), name)
  await user.click(screen.getByRole('button', { name: 'Продолжить' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('booking confirmation duration', () => {
  it('shows the confirmed duration between the time and the guest name', async () => {
    const user = userEvent.setup()
    vi.mocked(listMeetingTypes).mockResolvedValue({
      data: [fortyFiveMinutesType],
      status: 200,
      headers: new Headers(),
    })
    vi.mocked(listSlots).mockResolvedValue({
      data: slotsResponse([slot]),
      status: 200,
      headers: new Headers(),
    })
    vi.mocked(createMeeting).mockResolvedValue({
      data: bookedFortyFiveMeeting,
      status: 201,
      headers: new Headers(),
    })

    renderBookingPage()
    await book(user)

    expect(await screen.findByRole('heading', { name: 'Встреча забронирована' })).toBeVisible()
    expect(screen.getByText('Консультация')).toBeVisible()
    const when = screen.getByText('Пн, 2 ноября, 10:00–10:45 (МСК)')
    const duration = screen.getByText('Длительность: 45 мин')
    const guest = screen.getByText('Анна')
    expect(when).toBeVisible()
    expect(duration).toBeVisible()
    expect(guest).toBeVisible()
    expect(duration.previousElementSibling).toBe(when)
    expect(duration.nextElementSibling).toBe(guest)
    expect(screen.queryByRole('button', { name: 'Продолжить' })).not.toBeInTheDocument()
    expect(createMeeting).toHaveBeenCalledWith({
      meetingTypeId: 'consultation',
      start: '2026-11-02T10:00:00+03:00',
      guestName: 'Анна',
    })
  })

  it('uses the created meeting duration and keeps minutes for 60', async () => {
    const user = userEvent.setup()
    vi.mocked(listMeetingTypes).mockResolvedValue({
      data: [fortyFiveMinutesType],
      status: 200,
      headers: new Headers(),
    })
    vi.mocked(listSlots).mockResolvedValue({
      data: slotsResponse([slot]),
      status: 200,
      headers: new Headers(),
    })
    vi.mocked(createMeeting).mockResolvedValue({
      data: {
        ...bookedFortyFiveMeeting,
        durationMinutes: 60,
        end: '2026-11-02T11:00:00+03:00',
      },
      status: 201,
      headers: new Headers(),
    })

    renderBookingPage()
    await book(user)

    expect(await screen.findByRole('heading', { name: 'Встреча забронирована' })).toBeVisible()
    expect(screen.getByText('Длительность: 60 мин')).toBeVisible()
    expect(screen.queryByText('Длительность: 45 мин')).not.toBeInTheDocument()
  })
})
