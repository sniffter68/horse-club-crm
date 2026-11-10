import { TrainerScheduleView } from './TrainerScheduleView'

/** This entry mounts before CRM providers and never reads the CRM session. */
export function TmaRootGateway() {
  return <TrainerScheduleView />
}
