import { http } from './request'

export const getAdminStats = () => http.get('/admin/stats')

export const listAdminStars = ({ status = 'ALL', page = 1, pageSize = 20 } = {}) => {
  const q = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) })
  return http.get(`/admin/stars?${q}`)
}

export const updateStarStatus = (id, status) => http.patch(`/admin/stars/${id}/status`, { status })

export const deleteAdminStar = (id) => http.del(`/admin/stars/${id}`)

export const listAdminComments = ({ status = 'ALL', page = 1, pageSize = 20 } = {}) => {
  const q = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) })
  return http.get(`/admin/comments?${q}`)
}

export const updateCommentStatus = (id, status) => http.patch(`/admin/comments/${id}/status`, { status })

export const deleteAdminComment = (id) => http.del(`/admin/comments/${id}`)
