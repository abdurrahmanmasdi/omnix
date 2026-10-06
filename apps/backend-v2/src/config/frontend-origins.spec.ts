import { parseFrontendOrigins } from './frontend-origins';

describe('parseFrontendOrigins', () => {
  it('defaults to the local dashboard when unset or blank', () => {
    expect(parseFrontendOrigins(undefined)).toEqual(['http://localhost:3001']);
    expect(parseFrontendOrigins('  ')).toEqual(['http://localhost:3001']);
  });

  it('splits, trims and strips trailing slashes', () => {
    expect(
      parseFrontendOrigins(
        ' https://app.example.test/ , https://staging.example.test ',
      ),
    ).toEqual(['https://app.example.test', 'https://staging.example.test']);
  });

  it('drops empty entries', () => {
    expect(parseFrontendOrigins('https://app.example.test,,')).toEqual([
      'https://app.example.test',
    ]);
  });
});
