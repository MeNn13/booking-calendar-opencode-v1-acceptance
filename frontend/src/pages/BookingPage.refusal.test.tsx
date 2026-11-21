import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor } from '@testing-library/react'
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
import type {
  Meeting,
  MeetingType,
  ProblemDetails,
  Slot,
  SlotDay,
  SlotsResponse,
  createMeetingResponse,
} from '../api/generated/booking'

const meetingType: MeetingType = {
  id: 'znakomstvo',
  title: 'Знакомство',
  description: '',
  durationMinutes: 30,
}

const bookedMeeting: Meeting = {
  id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff',
  meetingTypeId: 'znakomstvo',
  meetingTypeTitle: 'Знакомство',
  durationMinutes: 30,
  start: '2026-11-02T10:00:00+03:00',
  end: '2026-11-02T10:30:00+03:00',
  guestName: 'Анна',
}

const freeSlot: Slot = {
  start: '2026-11-02T10:00:00+03:00',
  end: '2026-11-02T10:30:00+03:00',
  available: true,
}

const takenSlot: Slot = { ...freeSlot, available: false }

function windowDays(): SlotDay[] {
  return Array.from({ length: 14 }, (_, offset) => ({
    date: new Date(Date.UTC(2026, 10, 2 + offset)).toISOString().slice(0, 10),
    slots: [],
  }))
}

function slotsResponse(slots: Slot[]): SlotsResponse {
  return {
    timezone: 'Europe/Moscow',
    window: { from: '2026-11-02', to: '2026-11-15' },
    days: [{ ...windowDays()[0], slots }, ...windowDays().slice(1)],
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

function rejection(
  status: 400 | 404 | 409,
  type: ProblemDetails['type'],
  errors?: ProblemDetails['errors'],
): createMeetingResponse {
  const data: ProblemDetails = {
    type,
    title: 'Отказ',
    status,
    detail: 'Проверьте выбранные значения.',
    instance: '/api/meetings',
    ...(errors ? { errors } : {}),
  }
  return { data, status, headers: new Headers() }
}

async function bookFreeSlotWithName(user: UserEvent, name: string) {
  await user.click(await screen.findByRole('button', { name: /Знакомство/ }))
  await user.click(await screen.findByRole('button', { name: '10:00–10:30' }))
  await user.type(screen.getByLabelText('Ваше имя'), name)
  await user.click(screen.getByRole('button', { name: 'Продолжить' }))
}

function expectNoConfirmation() {
  expect(screen.queryByText('Встреча забронирована')).not.toBeInTheDocument()
  expect(screen.queryByText(/^Длительность:/)).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listMeetingTypes).mockResolvedValue({
    data: [meetingType],
    status: 200,
    headers: new Headers(),
  })
  vi.mocked(listSlots).mockResolvedValue({
    data: slotsResponse([freeSlot, takenSlot]),
    status: 200,
    headers: new Headers(),
  })
})

describe('booking refusal confirmation', () => {
  it('does not show a confirmation or duration after slot-taken', async () => {
    const user = userEvent.setup()
    vi.mocked(createMeeting).mockResolvedValueOnce(rejection(409, 'slot-taken'))

    renderBookingPage()
    await bookFreeSlotWithName(user, 'Анна')

    expect(
      await screen.findByText('Это время только что заняли. Выберите другое время.'),
    ).toBeVisible()
    await waitFor(() => expect(listSlots).toHaveBeenCalledTimes(2))
    expectNoConfirmation()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    expect(screen.getByLabelText('Ваше имя')).toHaveValue('Анна')
  })

  it('does not show a confirmation or duration after slot-not-bookable', async () => {
    const user = userEvent.setup()
    vi.mocked(createMeeting).mockResolvedValueOnce(rejection(400, 'slot-not-bookable'))

    renderBookingPage()
    await bookFreeSlotWithName(user, 'Анна')

    expect(await screen.findByText('Это время больше недоступно. Выберите другое.')).toBeVisible()
    await waitFor(() => expect(listSlots).toHaveBeenCalledTimes(2))
    expectNoConfirmation()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled()
    expect(screen.getByLabelText('Ваше имя')).toHaveValue('Анна')
  })

  it('does not show a confirmation or duration after meeting-type-not-found', async () => {
    const user = userEvent.setup()
    vi.mocked(createMeeting).mockResolvedValueOnce(rejection(404, 'meeting-type-not-found'))

    renderBookingPage()
    await bookFreeSlotWithName(user, 'Анна')

    expect(
      await screen.findByText('Этот тип встречи больше недоступен. Выберите другой.'),
    ).toBeVisible()
    await waitFor(() => expect(listMeetingTypes).toHaveBeenCalledTimes(2))
    expectNoConfirmation()
    expect(await screen.findByRole('button', { name: /Знакомство/ })).toBeVisible()
  })

  it('does not show a confirmation or duration after validation-failed', async () => {
    const user = userEvent.setup()
    vi.mocked(createMeeting).mockResolvedValueOnce(
      rejection(400, 'validation-failed', { guestName: ['Имя не может быть пустым.'] }),
    )

    renderBookingPage()
    await bookFreeSlotWithName(user, 'Анна')

    expect(await screen.findByText('Имя не может быть пустым.')).toBeVisible()
    expectNoConfirmation()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled()
  })

  it('removes the confirmation and duration on book again', async () => {
    const user = userEvent.setup()
    vi.mocked(createMeeting).mockResolvedValueOnce({
      data: bookedMeeting,
      status: 201,
      headers: new Headers(),
    })

    renderBookingPage()
    await bookFreeSlotWithName(user, 'Анна')

    expect(await screen.findByRole('heading', { name: 'Встреча забронирована' })).toBeVisible()
    expect(screen.getByText('Длительность: 30 мин')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Записаться ещё' }))

    expect(await screen.findByRole('button', { name: /Знакомство/ })).toBeVisible()
    expectNoConfirmation()
  })
})
