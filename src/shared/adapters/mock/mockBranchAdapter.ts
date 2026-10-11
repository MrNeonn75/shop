import { BranchRepository } from '../types';
import { Branch } from '../../types/models';
import { MOCK_BRANCHES } from './mockData';
import { env } from '../../config/env';

export class MockBranchAdapter implements BranchRepository {
  private branches: Branch[] = [...MOCK_BRANCHES];

  private async delay(): Promise<void> {
    const ms = env.VITE_MOCK_LATENCY_MS || 200;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getBranches(): Promise<Branch[]> {
    await this.delay();
    return [...this.branches];
  }

  async getBranchById(id: string): Promise<Branch | null> {
    await this.delay();
    const branch = this.branches.find((b) => b.id === id);
    return branch ? { ...branch } : null;
  }
}

