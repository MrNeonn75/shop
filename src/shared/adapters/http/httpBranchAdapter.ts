import { BranchRepository } from '../types';
import { Branch } from '../../types/models';
import { httpClient } from '../../api/httpClient';

export class HttpBranchAdapter implements BranchRepository {
  async getBranches(): Promise<Branch[]> {
    const response = await httpClient.get<Branch[]>('/branches');
    return response.data;
  }

  async getBranchById(id: string): Promise<Branch | null> {
    const response = await httpClient.get<Branch>(`/branches/${id}`);
    return response.data;
  }
}

