import { IS_UUID, ValidateBy, isUUID } from 'class-validator';

export function IsProblemId(): PropertyDecorator {
  return ValidateBy({
    name: IS_UUID,
    validator: {
      validate: (value: unknown) => isUUID(value, '4') || isUUID(value, '5'),
      defaultMessage: () => '$property must be a UUID',
    },
  });
}
