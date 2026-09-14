import { PartialType } from '@nestjs/swagger';
import { CreateBoardingContractDto } from './create-boarding-contract.dto';

export class UpdateBoardingContractDto extends PartialType(CreateBoardingContractDto) {}
