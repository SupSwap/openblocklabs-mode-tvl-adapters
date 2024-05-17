// Read data from the CSV file and parse it into an array of objects
import fs from 'fs';

export const readUserPositionTVLFromCSV = async (filePath: string, skipHeader: boolean = true): Promise<UserPoolTVL[]> => {
  const file = await fs.promises.readFile(filePath, 'utf-8');
  const lines = file.split('\n');
  const headers = skipHeader ? lines[0].split(',') : [];
  const data = skipHeader ? lines.slice(1).map((line: string) => line.split(',')) : lines.map((line: string) => line.split(','));
  return data.map((row: string[]) => {
    //console.log(row[0]+" "+row[1]+" "+row[2]+" "+row[3]+" "+row[4]+" "+row[5]+" "+row[6])
    return {
      user: row[0],
      pool: row[2],
      pairName: row[1],
      block: parseInt(row[3]),
      position: parseInt(row[4]),
      lpvalue: row[5],
      userPoolPositions: parseInt(row[6]),
    };
  });
};

