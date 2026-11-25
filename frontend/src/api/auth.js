import { http } from './request'

/** 免注册昵称快速体验 */
export const guestLogin = (nickname) => http.post('/auth/guest', { nickname })

/** @param {{ username: string, password: string, nickname?: string }} payload */
export const register = (payload) => http.post('/auth/register', payload)

/** @param {{ username: string, password: string }} payload */
export const login = (payload) => http.post('/auth/login', payload)

export const me = () => http.get('/auth/me')
