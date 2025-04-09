import { Request } from 'express';

export interface FormRequestBody {
  name: string;
  telephone: string;
  mail: string;
  message: string;
  agreeToTerms?: boolean;
}

export interface FormRequest extends Request {
  body: FormRequestBody;
  files: any[];
}
