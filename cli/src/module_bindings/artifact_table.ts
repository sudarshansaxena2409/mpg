/* eslint-disable */
/* tslint:disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
  type AlgebraicTypeType as __AlgebraicTypeType,
  type Infer as __Infer,
} from "spacetimedb";

export default __t.row({
  id: __t.string().primaryKey(),
  artifactType: __t.string().name("artifact_type"),
  title: __t.string(),
  description: __t.string(),
  status: __t.string(),
  stakeholdersJson: __t.string().name("stakeholders_json"),
  sourceChatRoomId: __t.string().name("source_chat_room_id"),
  sourceSeq: __t.u64().name("source_seq"),
  createdBy: __t.string().name("created_by"),
  createdAt: __t.timestamp().name("created_at"),
});
