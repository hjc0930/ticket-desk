export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFoundError = () => new AppError(404, 'NOT_FOUND', 'Route not found')

export const unauthorizedError = () => new AppError(401, 'UNAUTHORIZED', 'Authentication required')

export const forbiddenError = () => new AppError(403, 'FORBIDDEN', 'Insufficient permissions')

export const accountLockedError = () =>
  new AppError(423, 'AUTH_ACCOUNT_LOCKED', 'Account temporarily locked')

export const rateLimitedError = () => new AppError(429, 'AUTH_RATE_LIMITED', 'Too many requests')

export const userNotFoundError = () => new AppError(404, 'USER_NOT_FOUND', 'User not found')

export const usernameTakenError = () =>
  new AppError(409, 'USERNAME_TAKEN', 'Username is already taken')

export const selfModificationForbiddenError = () =>
  new AppError(403, 'SELF_MODIFICATION_FORBIDDEN', 'Cannot modify your own role or status')

export const categoryNotFoundError = () =>
  new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found')

export const categoryNameTakenError = () =>
  new AppError(409, 'CATEGORY_NAME_TAKEN', 'Category name is already taken')

export const ticketNotFoundError = () => new AppError(404, 'TICKET_NOT_FOUND', 'Ticket not found')

export const invalidCategoryError = () =>
  new AppError(400, 'INVALID_CATEGORY', 'Category does not exist or is disabled')

export const invalidStateTransitionError = () =>
  new AppError(400, 'INVALID_STATE_TRANSITION', 'Illegal state transition')

export const invalidHandlerError = () =>
  new AppError(400, 'INVALID_HANDLER', 'Handler must be an active agent or admin')
