/**
 * LRN-010-FR-005: `GET /api/topics` takes no parameters. Declaring an empty DTO makes the
 * global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) reject any query parameter
 * with `400` instead of silently ignoring it.
 */
export class ListTopicsQueryDto {}
