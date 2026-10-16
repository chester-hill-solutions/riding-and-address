/**
 * Common validation schemas used across the application.
 * Includes built-in normalization and consistent error messages.
 */
import { z } from "zod";
import { normalizeName, normalizeEmail, normalizePostalCode, normalizePhoneNumber, normalizeStreetAddress, normalizeProvince, } from "../normalization.js";
/**
 * Email validation with automatic normalization.
 * Validates format and converts to lowercase.
 */
export const EmailSchema = z
    .string()
    .email("Please provide a valid email address")
    .transform((val) => normalizeEmail(val));
/**
 * Password validation with configurable minimum length.
 * Default minimum is 8 characters.
 */
export const PasswordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100, "Password is too long (maximum 100 characters)");
/**
 * Password validation for bootstrap/admin setup (12 character minimum).
 */
export const BootstrapPasswordSchema = z
    .string()
    .min(12, "Admin password must be at least 12 characters long")
    .max(100, "Password is too long (maximum 100 characters)");
/**
 * Phone number validation with normalization.
 * Accepts various formats and normalizes them.
 */
export const PhoneSchema = z
    .string()
    .regex(/^[\d\s\-()+]+$/, "Please enter a valid phone number")
    .transform((val) => normalizePhoneNumber(val))
    .optional();
/**
 * Canadian postal code validation with normalization.
 * Expects format: A1A 1A1 or A1A1A1 (case-insensitive, space optional after 3rd character)
 */
export const CanadianPostalCodeSchema = z
    .string()
    .regex(/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/, "Please enter a valid Canadian postal code (A1A 1A1)")
    .transform((val) => normalizePostalCode(val));
/**
 * Name validation with normalization.
 * Handles first names, last names, etc.
 */
export const NameSchema = z
    .string()
    .min(1, "Name is required")
    .max(100, "Name is too long (maximum 100 characters)")
    .transform((val) => normalizeName(val));
/**
 * Street address validation with normalization.
 */
export const StreetAddressSchema = z
    .string()
    .min(1, "Street address is required")
    .max(200, "Address is too long (maximum 200 characters)")
    .transform((val) => normalizeStreetAddress(val));
/**
 * Province/territory validation with normalization.
 */
export const ProvinceSchema = z
    .string()
    .min(1, "Province is required")
    .transform((val) => normalizeProvince(val));
/**
 * Birth year validation.
 * Accepts reasonable birth years (1900 to current year).
 */
export const BirthYearSchema = z.coerce
    .number()
    .min(1900, "Please enter a valid birth year")
    .max(new Date().getFullYear(), "Birth year cannot be in the future");
/**
 * Birth month validation (1-12).
 */
export const BirthMonthSchema = z.coerce
    .number()
    .min(1, "Month must be between 1 and 12")
    .max(12, "Month must be between 1 and 12");
/**
 * Birth day validation (1-31).
 * Note: Full date validation should be done at the form level.
 */
export const BirthDaySchema = z.coerce
    .number()
    .min(1, "Day must be between 1 and 31")
    .max(31, "Day must be between 1 and 31");
/**
 * Role validation using existing RoleType enum.
 */
export const RoleSchema = z.string().min(1, "Role is required");
/**
 * Boolean validation for form checkboxes.
 * Converts checkbox "on" values to boolean.
 */
export const CheckboxBooleanSchema = z
    .literal("on", {
    message: "This field is required",
})
    .transform(() => true);
/**
 * Optional boolean for form checkboxes.
 */
export const OptionalCheckboxBooleanSchema = z
    .literal("on")
    .transform(() => true)
    .or(z.literal("off").transform(() => false))
    .or(z.string().transform(() => false))
    .optional();
/**
 * ID validation for database entities.
 * Accepts positive integers.
 */
export const IdSchema = z
    .number()
    .int("ID must be an integer")
    .positive("ID must be a positive number");
/**
 * Optional ID validation.
 */
export const OptionalIdSchema = z
    .number()
    .int("ID must be an integer")
    .positive("ID must be a positive number")
    .nullable()
    .optional();
