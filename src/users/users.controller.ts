import { Controller, Post, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './create-user.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Create a new user' })
  @Post()
  async register(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(
      createUserDto.email,
      createUserDto.password,
    );
  }
}
