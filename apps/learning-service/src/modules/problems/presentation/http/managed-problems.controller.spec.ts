import type { Principal } from '@learning/modules/problems/application/models/principal';

import type { CreateProblemRequestDto } from './dto/create-problem.request.dto';
import type { ManagedProblemQueryDto } from './dto/problem-query.dto';
import type { UpdateProblemRequestDto } from './dto/update-problem.request.dto';
import { ManagedProblemsController } from './managed-problems.controller';
import type { ProblemRequestMapper } from './mappers/problem-request.mapper';
import type { ProblemResponseMapper } from './mappers/problem-response.mapper';

const PRINCIPAL: Principal = {
  userId: '00000000-0000-4000-8000-000000000031',
  roles: ['ADMIN'],
  permissions: ['problem:create'],
};
const RESULT = { id: 'problem-id' };
const PAGE = { items: [RESULT], total: 1, page: 1, limit: 20 };
const RESPONSE = { id: 'problem-id' };

describe('ManagedProblemsController', () => {
  it('creates a problem from the mapped command', async () => {
    const createProblem = { execute: jest.fn().mockResolvedValue(RESULT) };
    const requestMapper = {
      toCreateCommand: jest.fn().mockReturnValue('create-command'),
      toUpdateCommand: jest.fn(),
    };
    const responseMapper = {
      toManagedDetail: jest.fn().mockReturnValue(RESPONSE),
      toManagedPage: jest.fn(),
      toSoftDelete: jest.fn(),
    };
    const controller = createController({ createProblem, requestMapper, responseMapper });
    const dto = { slug: 'two-sum' } as CreateProblemRequestDto;

    await expect(controller.create(PRINCIPAL, dto)).resolves.toEqual(RESPONSE);
    expect(requestMapper.toCreateCommand).toHaveBeenCalledWith(dto);
    expect(createProblem.execute).toHaveBeenCalledWith(PRINCIPAL, 'create-command');
    expect(responseMapper.toManagedDetail).toHaveBeenCalledWith(RESULT, false);
  });

  it('lists managed problems including deleted entries when requested', async () => {
    const listManagedProblems = { execute: jest.fn().mockResolvedValue(PAGE) };
    const responseMapper = {
      toManagedDetail: jest.fn(),
      toManagedPage: jest.fn().mockReturnValue(RESPONSE),
      toSoftDelete: jest.fn(),
    };
    const controller = createController({ listManagedProblems, responseMapper });
    const query = { includeDeleted: true, page: 2, limit: 5 } as ManagedProblemQueryDto;

    await expect(controller.listManaged(PRINCIPAL, query)).resolves.toEqual(RESPONSE);
    expect(listManagedProblems.execute).toHaveBeenCalledWith(PRINCIPAL, query);
    expect(responseMapper.toManagedPage).toHaveBeenCalledWith(PAGE, true);
  });

  it('gets a managed problem using the includeDeleted flag', async () => {
    const getManagedProblem = { execute: jest.fn().mockResolvedValue(RESULT) };
    const responseMapper = {
      toManagedDetail: jest.fn().mockReturnValue(RESPONSE),
      toManagedPage: jest.fn(),
      toSoftDelete: jest.fn(),
    };
    const controller = createController({ getManagedProblem, responseMapper });

    await controller.getManaged(PRINCIPAL, 'problem-id', { includeDeleted: true });

    expect(getManagedProblem.execute).toHaveBeenCalledWith(PRINCIPAL, 'problem-id', true);
    expect(responseMapper.toManagedDetail).toHaveBeenCalledWith(RESULT, true);
  });

  it('updates a problem from the mapped command', async () => {
    const updateProblem = { execute: jest.fn().mockResolvedValue(RESULT) };
    const requestMapper = {
      toCreateCommand: jest.fn(),
      toUpdateCommand: jest.fn().mockReturnValue('update-command'),
    };
    const responseMapper = {
      toManagedDetail: jest.fn().mockReturnValue(RESPONSE),
      toManagedPage: jest.fn(),
      toSoftDelete: jest.fn(),
    };
    const controller = createController({ updateProblem, requestMapper, responseMapper });
    const dto = { title: 'Updated' } as UpdateProblemRequestDto;

    await expect(controller.update(PRINCIPAL, 'problem-id', dto)).resolves.toEqual(RESPONSE);
    expect(requestMapper.toUpdateCommand).toHaveBeenCalledWith(dto);
    expect(updateProblem.execute).toHaveBeenCalledWith(PRINCIPAL, 'problem-id', 'update-command');
    expect(responseMapper.toManagedDetail).toHaveBeenCalledWith(RESULT, false);
  });

  it.each([
    ['publish', 'publishProblem'],
    ['hold', 'holdProblem'],
    ['republish', 'republishProblem'],
    ['restore', 'restoreProblem'],
  ] as const)(
    '%s delegates to its use case and strips deletion data',
    async (method, dependency) => {
      const useCase = { execute: jest.fn().mockResolvedValue(RESULT) };
      const responseMapper = {
        toManagedDetail: jest.fn().mockReturnValue(RESPONSE),
        toManagedPage: jest.fn(),
        toSoftDelete: jest.fn(),
      };
      const controller = createController({ [dependency]: useCase, responseMapper });

      await expect(controller[method](PRINCIPAL, 'problem-id')).resolves.toEqual(RESPONSE);
      expect(useCase.execute).toHaveBeenCalledWith(PRINCIPAL, 'problem-id');
      expect(responseMapper.toManagedDetail).toHaveBeenCalledWith(RESULT, false);
    },
  );

  it('soft-deletes a problem and maps the deletion result', async () => {
    const softDeleteProblem = { execute: jest.fn().mockResolvedValue(RESULT) };
    const responseMapper = {
      toManagedDetail: jest.fn(),
      toManagedPage: jest.fn(),
      toSoftDelete: jest.fn().mockReturnValue(RESPONSE),
    };
    const controller = createController({ softDeleteProblem, responseMapper });

    await expect(controller.remove(PRINCIPAL, 'problem-id')).resolves.toEqual(RESPONSE);
    expect(softDeleteProblem.execute).toHaveBeenCalledWith(PRINCIPAL, 'problem-id');
    expect(responseMapper.toSoftDelete).toHaveBeenCalledWith(RESULT);
  });

  it('previews a problem with deletion data included', async () => {
    const previewProblem = { execute: jest.fn().mockResolvedValue(RESULT) };
    const responseMapper = {
      toPreviewDetail: jest.fn().mockReturnValue(RESPONSE),
      toManagedPage: jest.fn(),
      toSoftDelete: jest.fn(),
    };
    const controller = createController({ previewProblem, responseMapper });

    await expect(controller.preview(PRINCIPAL, 'problem-id')).resolves.toEqual(RESPONSE);
    expect(previewProblem.execute).toHaveBeenCalledWith(PRINCIPAL, 'problem-id');
    expect(responseMapper.toPreviewDetail).toHaveBeenCalledWith(RESULT, true);
  });
});

interface ControllerDependencies {
  createProblem?: { execute: jest.Mock };
  updateProblem?: { execute: jest.Mock };
  publishProblem?: { execute: jest.Mock };
  holdProblem?: { execute: jest.Mock };
  republishProblem?: { execute: jest.Mock };
  softDeleteProblem?: { execute: jest.Mock };
  restoreProblem?: { execute: jest.Mock };
  getManagedProblem?: { execute: jest.Mock };
  listManagedProblems?: { execute: jest.Mock };
  previewProblem?: { execute: jest.Mock };
  requestMapper?: {
    toCreateCommand?: jest.Mock;
    toUpdateCommand?: jest.Mock;
  };
  responseMapper?: {
    toManagedDetail?: jest.Mock;
    toPreviewDetail?: jest.Mock;
    toManagedPage?: jest.Mock;
    toSoftDelete?: jest.Mock;
  };
}

function createController(dependencies: ControllerDependencies): ManagedProblemsController {
  const {
    createProblem = { execute: jest.fn() },
    updateProblem = { execute: jest.fn() },
    publishProblem = { execute: jest.fn() },
    holdProblem = { execute: jest.fn() },
    republishProblem = { execute: jest.fn() },
    softDeleteProblem = { execute: jest.fn() },
    restoreProblem = { execute: jest.fn() },
    getManagedProblem = { execute: jest.fn() },
    listManagedProblems = { execute: jest.fn() },
    previewProblem = { execute: jest.fn() },
    requestMapper = { toCreateCommand: jest.fn(), toUpdateCommand: jest.fn() },
    responseMapper = {
      toManagedDetail: jest.fn(),
      toPreviewDetail: jest.fn(),
      toManagedPage: jest.fn(),
      toSoftDelete: jest.fn(),
    },
  } = dependencies;

  return new ManagedProblemsController(
    createProblem,
    updateProblem,
    publishProblem,
    holdProblem,
    republishProblem,
    softDeleteProblem,
    restoreProblem,
    getManagedProblem,
    listManagedProblems,
    previewProblem,
    requestMapper as unknown as ProblemRequestMapper,
    responseMapper as unknown as ProblemResponseMapper,
  );
}
