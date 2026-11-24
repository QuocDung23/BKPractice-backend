import { isUUID, ValidatorConstraint } from 'class-validator';
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator';

import { PostScope } from '@/modules/posts/entities';

@ValidatorConstraint({ name: 'matchesPostScope', async: false })
export class PostTargetConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const scope = 'scope' in args.object ? args.object.scope : undefined;
    const requiredScope = args.property === 'problemId' ? PostScope.Problem : PostScope.Course;
    return scope === requiredScope
      ? typeof value === 'string' && isUUID(value)
      : value === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a UUID for its matching scope and omitted for other scopes`;
  }
}
