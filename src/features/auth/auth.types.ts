export type Customer = {
  id: string;
  name: string;
  email: string;
};

export type AuthenticatedCustomer = { customer: Customer };

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  termsAccepted: boolean;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ValidationProblem = {
  code: 'validation_error';
  message: string;
  fieldErrors: Record<string, string>;
};
