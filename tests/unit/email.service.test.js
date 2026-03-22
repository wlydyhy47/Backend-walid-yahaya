const EmailServiceClass = require('../../src/services/email.service');

// We need to re-require the module to bypass the cache if needed, but here we can just instantiate it.
describe('Email Service Unit Tests', () => {
  let emailService;

  beforeEach(() => {
    // Reset env vars needed for email
    process.env.EMAIL_ENABLED = 'true';
    process.env.CLIENT_URL = 'http://localhost:3000';
    process.env.APP_NAME = 'Test Delivery';
    
    // We instantiate a new class for each test
    emailService = new EmailServiceClass();
    
    // Polyfill the sendMail mock to return a Promise so await works smoothly
    if (emailService.transporter) {
      emailService.transporter.sendMail = jest.fn().mockResolvedValue({ messageId: 'test-mock-id' });
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should format base template correctly', () => {
    const html = emailService.getBaseTemplate('<p>Test Content</p>', 'Test Title');
    expect(html).toContain('<p>Test Content</p>');
    expect(html).toContain('Test Title');
    expect(html).toContain('Test Delivery');
  });

  it('should send a standard email successfully', async () => {
    const result = await emailService.sendEmail('user@test.com', 'Subject', '<html></html>');
    
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('test-mock-id');
    expect(emailService.transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@test.com',
      subject: 'Subject'
    }));
  });

  it('should fallback to queued process if sending fails (simulate error)', async () => {
    emailService.transporter.sendMail.mockRejectedValue(new Error('SMTP Error'));
    
    const result = await emailService.sendEmail('user2@test.com', 'Subject', '<html></html>');
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('SMTP Error');
    expect(result.queued).toBe(true);
    expect(emailService.emailQueue.length).toBe(1);
  });

  it('sendWelcomeEmail should send properly formatted welcome email', async () => {
    const user = { name: 'New User', email: 'new@test.com' };
    const result = await emailService.sendWelcomeEmail(user);
    
    expect(result.success).toBe(true);
    const mockCall = emailService.transporter.sendMail.mock.calls[0][0];
    expect(mockCall.to).toBe('new@test.com');
    expect(mockCall.subject).toContain('مرحباً بك في'); // "Welcome to" in Arabic
    expect(mockCall.html).toContain('New User');
  });
});
