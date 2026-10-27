import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One DIBBS daily archive (ca{yymmdd}.zip) and how far the ingest got with it. */
@Entity()
export class Archive {
  @PrimaryGeneratedColumn()
  id: number;

  /** Post date taken from the file name (the yymmdd), as YYYY-MM-DD. */
  @Column({ type: 'date', unique: true })
  date: string;

  @Column()
  fileUrl: string;

  @Column({
    type: 'simple-enum',
    enum: ['pending', 'downloaded', 'parsed'],
    default: 'pending',
  })
  state: 'pending' | 'downloaded' | 'parsed';

  /** Sample data from demo.service.ts. The job never picks it up, and a real archive for the same day replaces it. */
  @Column({ default: false })
  demo: boolean;

  /** What went wrong in the last download or parse: the files skipped and why. */
  @Column({ type: 'simple-json', nullable: true })
  errors: { file: string; error: string }[] | null;
}
