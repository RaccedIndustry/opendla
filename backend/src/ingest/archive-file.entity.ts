import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One DIBBS daily archive (ca{yymmdd}.zip) and how far the ingest got with it. */
@Entity()
export class ArchiveFile {
  @PrimaryGeneratedColumn()
  id: number;

  /** Post date taken from the file name (the yymmdd), as YYYY-MM-DD. */
  @Column({ type: 'date', unique: true })
  date: string;

  @Column()
  url: string;

  @Column({
    type: 'simple-enum',
    enum: ['pending', 'downloaded', 'parsed'],
    default: 'pending',
  })
  state: 'pending' | 'downloaded' | 'parsed';
}
