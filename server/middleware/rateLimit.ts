import { rateLimit } from "express-rate-limit";

// Exported config objects for testability
export const generalLimiterConfig = {
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." }
};

export const mlLimiterConfig = {
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many prediction requests, please try again later." }
};

export const adminLimiterConfig = {
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin requests, please try again later." }
};

export const exportLimiterConfig = {
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many export requests, please try again later." }
};

export const assessmentLimiterConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many assessment requests, please try again later." }
};

export const previewLimiterConfig = {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many preview requests, please try again later." }
};

// Middleware functions
export const generalLimiter = rateLimit(generalLimiterConfig);
export const mlLimiter = rateLimit(mlLimiterConfig);
export const adminLimiter = rateLimit(adminLimiterConfig);
export const exportLimiter = rateLimit(exportLimiterConfig);
export const assessmentLimiter = rateLimit(assessmentLimiterConfig);
export const previewLimiter = rateLimit(previewLimiterConfig);
