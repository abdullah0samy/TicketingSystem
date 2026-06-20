import { Module, Global } from '@nestjs/common';
import { TicketGateway } from './ticket.gateway';

@Global()
@Module({
  providers: [TicketGateway],
  exports: [TicketGateway],
})
export class GatewaysModule {}
