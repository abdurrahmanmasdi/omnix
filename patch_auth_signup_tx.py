import re

file = "src/auth/auth.service.ts"
with open(file, "r") as f:
    content = f.read()

# Replace signup body with transaction
old_signup = """  async signup(signupDto: SignupDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: signupDto.email },
    });

    if (existingUser)
      throw new ConflictException('A user with this email already exists');

    const hashedPassword = await bcrypt.hash(signupDto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: signupDto.email,
        password_hash: hashedPassword,
        firstName: signupDto.firstName,
        lastName: signupDto.lastName,
        status: 'PENDING',
      },
    });

    // 1. Generate an Email Verification Token (Expires in 1 hour)
    const emailVerificationToken = this.jwtService.sign(
      { email: user.email },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '1h',
      },
    );

    // 2. SIMULATE SENDING EMAIL (In production, use Resend, Sendgrid, AWS SES, etc.)
    console.log(`\\n📧 [EMAIL SIMULATION] To: ${user.email}`);
    console.log(
      `Please click here to verify your email: http://localhost:3000/api/auth/verify-email?token=${emailVerificationToken}\\n`,
    );

    return this.generateTokens(
      user.id,
      user.email,
      null,
      null,
      user.firstName,
      user.lastName,
    );
  }"""

new_signup = """  async signup(signupDto: SignupDto) {
    return this.prisma.$transaction(async (tx) => {
      // By using unique constraint, we don't necessarily need to check first, but we can.
      const existingUser = await tx.user.findUnique({
        where: { email: signupDto.email },
      });

      if (existingUser)
        throw new ConflictException('A user with this email already exists');

      const hashedPassword = await bcrypt.hash(signupDto.password, 10);
      const user = await tx.user.create({
        data: {
          email: signupDto.email,
          password_hash: hashedPassword,
          firstName: signupDto.firstName,
          lastName: signupDto.lastName,
          status: 'PENDING',
        },
      });

      // 1. Generate an Email Verification Token (Expires in 1 hour)
      const emailVerificationToken = this.jwtService.sign(
        { email: user.email },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: '1h',
        },
      );

      // 2. SIMULATE SENDING EMAIL (In production, use Resend, Sendgrid, AWS SES, etc.)
      console.log(`\\n📧 [EMAIL SIMULATION] To: ${user.email}`);
      console.log(
        `Please click here to verify your email: http://localhost:3000/api/auth/verify-email?token=${emailVerificationToken}\\n`,
      );

      return this.generateTokens(
        user.id,
        user.email,
        null,
        null,
        user.firstName,
        user.lastName,
      );
    });
  }"""

content = content.replace(old_signup, new_signup)

with open(file, "w") as f:
    f.write(content)
